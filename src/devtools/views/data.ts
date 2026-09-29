/**
 * Data — the app's data layer: cached `$query` / `Http({...})` resources (with
 * refetch, invalidate, cancel, and one-click "simulate loading / error"),
 * `$store` and `$form` handles (call methods, edit state), and the page's
 * browser storage (edit, delete, add — with secrets flagged).
 */

import { h, type Child } from "../core/vdom.js";
import { can, type ViewContext, type ViewDefinition } from "../context.js";
import type { QueryInfo, StoreInfo } from "../protocol.js";
import { newRule } from "../rules.js";
import { classifySecret, readPageStorage } from "../analysis/security.js";
import { parseEditedValue } from "../serialize.js";
import {
  button, chip, emptyState, field, fmtAgo, fmtBytes, iconButton, note, segmented, spacer, spinner, stat, statGrid, textarea, viewbar, vsep, kv, truncateMiddle,
} from "../ui/kit.js";
import { dataTable, split, type Column } from "../ui/layout.js";
import { valueTree } from "../ui/value.js";
import { noApp, paneSize, setPaneSize, unsupported } from "./common.js";

/* -------------------------------------------------------------------------- */
/*  Queries                                                                    */
/* -------------------------------------------------------------------------- */

function queryTone(q: QueryInfo): "green" | "blue" | "red" | "grey" {
  if (q.loading) return "blue";
  if (q.state === "error") return "red";
  if (q.state === "stale" || q.state === "idle") return "grey";
  return "green";
}

function queryUrl(key: string): string {
  const withoutMethod = key.replace(/^[A-Z]+\s+/, "");
  return withoutMethod.split(/\s/)[0] ?? withoutMethod;
}

function pathPattern(url: string): string {
  try {
    const parsed = new URL(url, typeof location !== "undefined" ? location.href : "http://localhost/");
    return parsed.pathname;
  } catch {
    return url.split("?")[0] ?? url;
  }
}

const SIM_LABEL = "devtools:simulate";

function simulate(ctx: ViewContext, q: QueryInfo, mode: "loading" | "error" | "restore"): void {
  const { ui, app } = ctx;
  const pattern = pathPattern(queryUrl(q.key));
  ui.rules = ui.rules.filter((rule) => !(rule.label === SIM_LABEL && rule.pattern === pattern));
  if (mode === "loading") ui.rules = [newRule({ label: SIM_LABEL, pattern, action: "delay", delayMs: 600_000 }), ...ui.rules];
  if (mode === "error") ui.rules = [newRule({ label: SIM_LABEL, pattern, action: "mock", status: 500, body: JSON.stringify({ error: "Simulated failure (DevTools)" }) }), ...ui.rules];
  ctx.pushRules();
  if (can(app, "refetchQuery")) app.refetchQuery(q.key);
  ctx.toast(mode === "restore" ? "Simulation removed — refetching for real" : mode === "loading" ? "Simulating a request that never finishes" : "Simulating a 500 from the server", mode === "restore" ? "good" : "warn", {
    action: mode === "restore" ? undefined : { label: "Restore", run: () => simulate(ctx, q, "restore") },
  });
  ctx.refresh();
}

function isSimulated(ctx: ViewContext, q: QueryInfo): boolean {
  const pattern = pathPattern(queryUrl(q.key));
  return ctx.ui.rules.some((rule) => rule.label === SIM_LABEL && rule.pattern === pattern && rule.enabled);
}

function valueOf(value: { json?: string; preview: string }): unknown {
  if (value.json === undefined) return value.preview;
  try {
    return JSON.parse(value.json) as unknown;
  } catch {
    return value.preview;
  }
}

function queriesPane(ctx: ViewContext): Child {
  const { app, ui } = ctx;
  if (!can(app, "getQueries")) return h("div", { class: "dt-pad" }, unsupported("its query cache"));
  const queries = ctx.cache("queries", () => app.getQueries());
  const selected = queries.find((q) => q.key === ui.selectedQuery) ?? null;
  const now = Date.now();
  const columns: Column<QueryInfo>[] = [
    { key: "state", label: "", width: 28, render: (q) => (q.loading ? spinner() : h("span", { class: `dt-dot t-${queryTone(q)}` })) },
    { key: "key", label: "Query", flex: 3, sort: (q) => q.key, render: (q) => h("span", { class: "row-flex" }, h("span", { class: "ellipsis mono" }, truncateMiddle(q.key, 80)), isSimulated(ctx, q) ? chip("simulated", "amber") : null) },
    { key: "status", label: "Status", width: 70, render: (q) => (q.status ? chip(String(q.status), q.status >= 400 ? "red" : "blue") : h("span", { class: "t4" }, "—")) },
    { key: "updated", label: "Updated", width: 90, align: "right", sort: (q) => q.lastUpdated ?? 0, render: (q) => h("span", { class: "t3 num" }, q.lastUpdated ? fmtAgo(q.lastUpdated, now) : "never") },
  ];
  const table = dataTable({
    columns, rows: queries, rowKey: (q) => q.key, rowHeight: ctx.rowHeight,
    selected: ui.selectedQuery, onSelect: (q) => { ui.selectedQuery = q.key; ctx.refresh(); },
    version: Math.floor(now / 1000), testid: "queries-table", ariaLabel: "Cached queries",
    empty: emptyState({ icon: "data", title: "No cached queries", body: ["A ", h("code", {}, "$query({ url })"), " or ", h("code", {}, "Http({…})"), " resource appears here as soon as the program creates one."] }),
  });
  const detail = selected ? h("div", { class: "dv-detail", "data-dt": "query-detail" },
    h("div", { class: "pane-head" },
      h("span", { class: `dt-dot t-${queryTone(selected)}` }),
      h("span", { class: "pane-title mono", title: selected.key }, truncateMiddle(selected.key, 56)),
      spacer(),
      iconButton({ icon: "close", label: "Close", size: "sm", onClick: () => { ui.selectedQuery = null; ctx.refresh(); } })),
    h("div", { class: "dv-actions" },
      can(app, "refetchQuery") ? button({ label: "Refetch", size: "sm", icon: "refresh", variant: "primary", onClick: () => { app.refetchQuery(selected.key); ctx.toast("Refetching…"); } }) : null,
      can(app, "invalidateQueries") ? button({ label: "Invalidate", size: "sm", icon: "undo", onClick: () => { app.invalidateQueries(selected.key); ctx.toast("Invalidated"); } }) : null,
      selected.loading && can(app, "cancelQuery") ? button({ label: "Cancel", size: "sm", icon: "stop", onClick: () => { app.cancelQuery(selected.key); ctx.toast("Cancelled"); } }) : null,
      h("span", { class: "vb-sep" }),
      can(app, "setNetworkRules") ? button({ label: "Simulate loading", size: "sm", icon: "clock", testid: "sim-loading", onClick: () => simulate(ctx, selected, "loading") }) : null,
      can(app, "setNetworkRules") ? button({ label: "Simulate error", size: "sm", icon: "error", testid: "sim-error", onClick: () => simulate(ctx, selected, "error") }) : null,
      isSimulated(ctx, selected) ? button({ label: "Restore", size: "sm", icon: "check", variant: "success", onClick: () => simulate(ctx, selected, "restore") }) : null),
    h("div", { class: "pane-body is-pad stack" },
      statGrid(
        stat({ label: "State", value: selected.loading ? "loading" : selected.state, tone: selected.state === "error" ? "red" : selected.loading ? "accent" : undefined }),
        stat({ label: "Status", value: selected.status ? String(selected.status) : "—" }),
        stat({ label: "Updated", value: selected.lastUpdated ? fmtAgo(selected.lastUpdated, now) : "never" }),
        selected.infinite ? stat({ label: "Pages", value: String(selected.page ?? 1), foot: selected.hasMore ? "more available" : "all loaded" }) : null),
      selected.error ? h("div", {}, h("div", { class: "it-sub" }, "Error"),
        selected.error.json !== undefined && typeof valueOf(selected.error) === "object" && valueOf(selected.error) !== null
          ? h("div", { class: "dv-error" }, valueTree({
              scope: `query-error:${selected.key}`, value: valueOf(selected.error), expanded: ui.dataExpanded, rowHeight: ctx.rowHeight, inline: true,
              onToggle: (p) => { if (ui.dataExpanded.has(p)) ui.dataExpanded.delete(p); else ui.dataExpanded.add(p); ctx.refresh(); },
              editing: null, setEditing: () => undefined, onCopy: (t, w) => ctx.copy(t, w),
            }))
          : note("error", selected.error.preview)) : null,
      h("div", {},
        h("div", { class: "it-sub row-flex" }, "Data", spacer(), iconButton({ icon: "copy", label: "Copy the data", size: "sm", onClick: () => ctx.copy(selected.data.json ?? selected.data.preview, "the data") })),
        valueTree({
          scope: `query:${selected.key}`, value: valueOf(selected.data), expanded: ui.dataExpanded, rowHeight: ctx.rowHeight, inline: true,
          onToggle: (p) => { if (ui.dataExpanded.has(p)) ui.dataExpanded.delete(p); else ui.dataExpanded.add(p); ctx.refresh(); },
          editing: null, setEditing: () => undefined, onCopy: (t, w) => ctx.copy(t, w), testid: "query-data",
        })))) : null;
  return h("div", { class: "dv-pane" },
    h("div", { class: "dv-bar" },
      field({ value: ui.invalidateDraft, placeholder: "Invalidate every query whose key contains…", mono: true, label: "Invalidate by pattern", onInput: (v) => { ui.invalidateDraft = v; }, onCommit: (v) => { if (v.trim() && can(app, "invalidateQueries")) { app.invalidateQueries(v.trim()); ctx.toast(`Invalidated queries matching “${v.trim()}”`); } } }),
      button({ label: "Invalidate", size: "sm", disabled: !can(app, "invalidateQueries"), onClick: () => { const v = ui.invalidateDraft.trim(); if (v && can(app, "invalidateQueries")) { app.invalidateQueries(v); ctx.toast(`Invalidated queries matching “${v}”`); } } })),
    selected
      ? (ctx.width() >= 760
          ? split({ size: paneSize(ctx, "data.queries", Math.round(ctx.width() * 0.5)), min: 280, onResize: (s) => setPaneSize(ctx, "data.queries", s), first: table, second: detail })
          : split({ direction: "col", size: 180, min: 100, onResize: () => undefined, first: table, second: detail }))
      : table);
}

/* -------------------------------------------------------------------------- */
/*  Stores + forms                                                             */
/* -------------------------------------------------------------------------- */

function formSummary(value: unknown): Child {
  if (!value || typeof value !== "object") return null;
  const v = value as { values?: Record<string, unknown>; errors?: Record<string, unknown>; touched?: Record<string, unknown>; submitting?: boolean; valid?: boolean; dirty?: boolean };
  if (!v.values || typeof v.values !== "object") return null;
  const fields = Object.keys(v.values);
  return h("div", {},
    h("div", { class: "it-sub row-flex" }, `Form fields (${fields.length})`, spacer(),
      v.valid !== undefined ? chip(v.valid ? "valid" : "invalid", v.valid ? "green" : "red") : null,
      v.dirty ? chip("dirty", "amber") : null,
      v.submitting ? chip("submitting", "blue") : null),
    h("div", { class: "it-attrs" }, ...fields.map((name) => {
      const error = v.errors?.[name];
      const touched = v.touched?.[name];
      return h("div", { key: name, class: "it-attr" },
        h("span", { class: "it-attr-k" }, name),
        h("span", { class: "it-attr-v row-flex" },
          h("span", { class: "v t-string ellipsis" }, JSON.stringify(v.values![name]) ?? "undefined"),
          touched ? chip("touched", "grey") : null,
          error ? chip(String(error), "red") : null));
    })));
}

function storesPane(ctx: ViewContext): Child {
  const { app, ui } = ctx;
  if (!can(app, "getStores")) return h("div", { class: "dt-pad" }, unsupported("its stores"));
  const stores = ctx.cache("stores", () => app.getStores());
  const selected = stores.find((s) => s.atom === ui.selectedStore) ?? null;
  const columns: Column<StoreInfo>[] = [
    { key: "flavour", label: "Kind", width: 70, render: (s) => chip(s.flavour, s.flavour === "form" ? "purple" : "blue") },
    { key: "atom", label: "Handle", flex: 2, render: (s) => h("span", { class: "mono ellipsis" }, s.atom) },
    { key: "methods", label: "Methods", width: 80, align: "right", render: (s) => h("span", { class: "num t3" }, String(s.methods.length)) },
    { key: "line", label: "Line", width: 60, align: "right", render: (s) => h("span", { class: "num t3" }, s.source ? `L${s.source.line}` : "") },
  ];
  const table = dataTable({
    columns, rows: stores, rowKey: (s) => s.atom, rowHeight: ctx.rowHeight,
    selected: ui.selectedStore, onSelect: (s) => { ui.selectedStore = s.atom; ctx.refresh(); },
    testid: "stores-table", ariaLabel: "Stores and forms",
    empty: emptyState({ icon: "data", title: "No stores or forms", body: [h("code", {}, "$store({…})"), " and ", h("code", {}, "$form({…})"), " handles show up here."] }),
  });
  const value = selected ? valueOf(selected.value) : null;
  const detail = selected ? h("div", { class: "dv-detail", "data-dt": "store-detail" },
    h("div", { class: "pane-head" }, chip(selected.flavour, selected.flavour === "form" ? "purple" : "blue"), h("span", { class: "pane-title mono" }, selected.atom), spacer(),
      iconButton({ icon: "close", label: "Close", size: "sm", onClick: () => { ui.selectedStore = null; ctx.refresh(); } })),
    h("div", { class: "pane-body is-pad stack" },
      selected.methods.length > 0 ? h("div", {},
        h("div", { class: "it-sub" }, "Methods — click to call (arguments as JSON)"),
        h("div", { class: "dv-methods" }, ...selected.methods.map((method) => {
          const argsKey = `${selected.atom}.${method}`;
          const draft = ui.storeArgs;
          return h("div", { key: method, class: "dv-method" },
            h("code", { class: "tone-cyan" }, `${method}(`),
            field({ value: draft[argsKey] ?? "", placeholder: "args…", mono: true, width: "150px", label: `Arguments for ${method}`, onInput: (v) => { draft[argsKey] = v; } }),
            h("code", { class: "tone-cyan" }, ")"),
            button({ label: "Call", size: "sm", disabled: !can(app, "callStoreMethod"), onClick: () => {
              const raw = (draft[argsKey] ?? "").trim();
              let args: unknown[] = [];
              if (raw) {
                const parsed = parseEditedValue(raw.startsWith("[") ? raw : `[${raw}]`);
                args = Array.isArray(parsed) ? parsed : [parsed];
              }
              const result = app!.callStoreMethod!(selected.atom, method, args);
              ctx.toast(result.ok ? `${method}() → ${result.value?.preview ?? "undefined"}` : `${method}() failed: ${result.error}`, result.ok ? "good" : "bad");
            } }));
        }))) : null,
      formSummary(value),
      h("div", {},
        h("div", { class: "it-sub" }, "State"),
        valueTree({
          scope: `store:${selected.atom}`, value, expanded: ui.dataExpanded, rowHeight: ctx.rowHeight, inline: true,
          onToggle: (p) => { if (ui.dataExpanded.has(p)) ui.dataExpanded.delete(p); else ui.dataExpanded.add(p); ctx.refresh(); },
          editable: () => true,
          editing: ui.edit, setEditing: (edit) => { ui.edit = edit; ctx.refresh(); },
          onEdit: (path, next) => { app!.setState(`${selected.atom}.${path}`, next); ctx.toast(`${selected.atom}.${path} updated`, "good"); },
          onCopy: (t, w) => ctx.copy(t, w),
        })))) : null;
  return selected
    ? (ctx.width() >= 760
        ? split({ size: paneSize(ctx, "data.stores", Math.round(ctx.width() * 0.42)), min: 240, onResize: (s) => setPaneSize(ctx, "data.stores", s), first: table, second: detail })
        : split({ direction: "col", size: 160, min: 100, onResize: () => undefined, first: table, second: detail }))
    : table;
}

/* -------------------------------------------------------------------------- */
/*  Storage                                                                    */
/* -------------------------------------------------------------------------- */

interface StorageRow {
  key: string;
  value: string;
  kind: ReturnType<typeof classifySecret>["kind"];
  label?: string;
}

function writeStorage(kind: "local" | "session" | "cookies", key: string, value: string | null): boolean {
  try {
    if (kind === "cookies") {
      document.cookie = value === null
        ? `${encodeURIComponent(key)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
        : `${encodeURIComponent(key)}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
      return true;
    }
    const area = kind === "local" ? localStorage : sessionStorage;
    if (value === null) area.removeItem(key);
    else area.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function storagePane(ctx: ViewContext): Child {
  const { ui } = ctx;
  const all = readPageStorage();
  const entries = ui.storageKind === "local" ? all.local : ui.storageKind === "session" ? all.session : all.cookies;
  const rows: StorageRow[] = entries.map(([key, value]) => {
    const verdict = classifySecret(key, value);
    return { key, value, kind: verdict.kind, label: verdict.label };
  });
  const selected = rows.find((r) => r.key === ui.storageSelected) ?? null;
  const bytes = rows.reduce((sum, r) => sum + r.key.length + r.value.length, 0);
  const columns: Column<StorageRow>[] = [
    { key: "key", label: "Key", flex: 1.2, sort: (r) => r.key, render: (r) => h("span", { class: "row-flex" }, h("span", { class: "mono ellipsis" }, r.key), r.kind !== "none" ? chip(r.label ?? "secret", "amber", { icon: "key", tip: "Looks like a credential — readable by any script on this origin" }) : null) },
    { key: "value", label: "Value", flex: 2.4, render: (r) => h("span", { class: "mono ellipsis t2" }, r.value) },
    { key: "size", label: "Size", width: 70, align: "right", sort: (r) => r.value.length, render: (r) => h("span", { class: "num t3" }, fmtBytes(r.key.length + r.value.length)) },
  ];
  const table = dataTable({
    columns, rows, rowKey: (r) => r.key, rowHeight: ctx.rowHeight,
    selected: ui.storageSelected, onSelect: (r) => { ui.storageSelected = r.key; ctx.refresh(); },
    testid: "storage-table", ariaLabel: "Storage entries",
    empty: emptyState({ icon: "data", title: `Nothing in ${ui.storageKind === "cookies" ? "cookies" : `${ui.storageKind}Storage`}` }),
  });
  let editor: Child = null;
  if (selected) {
    let parsed: unknown;
    let isJson = false;
    try {
      parsed = JSON.parse(selected.value);
      isJson = typeof parsed === "object" && parsed !== null;
    } catch {
      isJson = false;
    }
    const verdict = classifySecret(selected.key, selected.value);
    const draft = ui.storageEdit?.key === selected.key ? ui.storageEdit.value : selected.value;
    const save = (): void => {
      // Read the draft at click time: the closure was built before the typing.
      const value = ui.storageEdit?.key === selected.key ? ui.storageEdit.value : selected.value;
      const ok = writeStorage(ui.storageKind, selected.key, value);
      ui.storageEdit = null;
      ctx.toast(ok ? `${selected.key} saved` : `Could not write ${selected.key}`, ok ? "good" : "bad", ok ? { action: { label: "Undo", run: () => { writeStorage(ui.storageKind, selected.key, selected.value); ctx.refresh(); } } } : undefined);
      ctx.refresh();
    };
    editor = h("div", { class: "dv-detail", "data-dt": "storage-detail" },
      h("div", { class: "pane-head" }, h("span", { class: "pane-title mono" }, selected.key), spacer(),
        iconButton({ icon: "copy", label: "Copy value", size: "sm", onClick: () => ctx.copy(selected.value, "the value") }),
        iconButton({ icon: "trash", label: "Delete", size: "sm", danger: true, onClick: () => { writeStorage(ui.storageKind, selected.key, null); ui.storageSelected = null; ctx.toast(`Removed ${selected.key}`, "good", { action: { label: "Undo", run: () => { writeStorage(ui.storageKind, selected.key, selected.value); ctx.refresh(); } } }); ctx.refresh(); } }),
        iconButton({ icon: "close", label: "Close", size: "sm", onClick: () => { ui.storageSelected = null; ctx.refresh(); } })),
      h("div", { class: "pane-body is-pad stack" },
        verdict.jwt ? h("div", {},
          h("div", { class: "it-sub" }, "Decoded JWT (not verified)"),
          kv([
            ["algorithm", verdict.jwt.alg ?? "?"],
            ["subject", verdict.jwt.sub ?? "—"],
            ["issuer", verdict.jwt.iss ?? "—"],
            ["expires", verdict.jwt.exp ? h("span", { class: verdict.jwt.expired ? "tone-red" : "" }, `${new Date(verdict.jwt.exp * 1000).toISOString()}${verdict.jwt.expired ? " (expired)" : ""}`) : "never"],
          ])) : null,
        verdict.kind !== "none" ? note("warn", "Any script on this origin — including injected ones — can read this. Session credentials belong in HttpOnly cookies.") : null,
        isJson
          ? valueTree({
              scope: `storage:${selected.key}`, value: parsed, expanded: ui.dataExpanded, rowHeight: ctx.rowHeight, inline: true,
              onToggle: (p) => { if (ui.dataExpanded.has(p)) ui.dataExpanded.delete(p); else ui.dataExpanded.add(p); ctx.refresh(); },
              editable: () => true, editing: ui.edit, setEditing: (edit) => { ui.edit = edit; ctx.refresh(); },
              onEdit: (path, next) => {
                const segments = path.split(".");
                const root = structuredClone(parsed) as Record<string, unknown>;
                let cursor: Record<string, unknown> = root;
                for (const segment of segments.slice(0, -1)) cursor = cursor[segment] as Record<string, unknown>;
                cursor[segments[segments.length - 1]!] = next;
                writeStorage(ui.storageKind, selected.key, JSON.stringify(root));
                ctx.toast(`${selected.key} updated — the app sees it on its next read`, "good");
                ctx.refresh();
              },
              editJson: (_p, v) => ctx.editJson({ title: `Edit ${selected.key}`, value: v, onSave: (next) => { writeStorage(ui.storageKind, selected.key, JSON.stringify(next)); ctx.refresh(); } }),
              onCopy: (t, w) => ctx.copy(t, w),
            })
          : textarea({
              value: draft, rows: 6, mono: true, label: "Value", testid: "storage-value",
              // Re-render so Save enables as soon as there is a change; the
              // textarea is controlled by the draft, so its text survives.
              onInput: (value) => { ui.storageEdit = { key: selected.key, value }; ctx.refresh(); },
              onKeyDown: (event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  save();
                }
              },
            }),
        !isJson ? h("div", { class: "row-flex" },
          button({ label: "Save", size: "sm", variant: "primary", icon: "save", disabled: draft === selected.value, onClick: save }),
          draft !== selected.value ? button({ label: "Revert", size: "sm", variant: "ghost", onClick: () => { ui.storageEdit = null; ctx.refresh(); } }) : null,
          h("span", { class: "hint" }, "⌘/Ctrl + Enter saves.")) : null));
  }
  return h("div", { class: "dv-pane" },
    h("div", { class: "dv-bar" },
      segmented([
        { value: "local", label: "localStorage", count: all.local.length || null },
        { value: "session", label: "sessionStorage", count: all.session.length || null },
        { value: "cookies", label: "Cookies", count: all.cookies.length || null },
      ], ui.storageKind, (v) => { ui.storageKind = v; ui.storageSelected = null; ctx.refresh(); }, { label: "Storage area" }),
      h("span", { class: "t3", style: { fontSize: "var(--dt-fs-sm)" } }, `${rows.length} keys · ${fmtBytes(bytes)}`),
      spacer(),
      field({ value: ui.storageDraft.key, placeholder: "key", width: "120px", mono: true, label: "New key", onInput: (v) => { ui.storageDraft.key = v; } }),
      field({ value: ui.storageDraft.value, placeholder: "value (text or JSON)", width: "180px", mono: true, label: "New value", onInput: (v) => { ui.storageDraft.value = v; }, onCommit: () => add() }),
      button({ label: "Add", size: "sm", icon: "plus", onClick: () => add() }),
      rows.length > 0 ? iconButton({ icon: "trash", label: "Clear this area", danger: true, onClick: () => {
        const backup = entries.map(([k, v]) => [k, v] as const);
        for (const [key] of entries) writeStorage(ui.storageKind, key, null);
        ctx.toast(`Cleared ${backup.length} keys`, "warn", { action: { label: "Undo", run: () => { for (const [k, v] of backup) writeStorage(ui.storageKind, k, v); ctx.refresh(); } } });
        ctx.refresh();
      } }) : null),
    ui.storageKind === "cookies" ? note("plain", "Only cookies visible to JavaScript are listed — HttpOnly cookies (the secure kind) never appear here.", { icon: "cookie" }) : null,
    selected
      ? (ctx.width() >= 760
          ? split({ size: paneSize(ctx, "data.storage", Math.round(ctx.width() * 0.5)), min: 260, onResize: (s) => setPaneSize(ctx, "data.storage", s), first: table, second: editor })
          : split({ direction: "col", size: 180, min: 100, onResize: () => undefined, first: table, second: editor }))
      : table);

  function add(): void {
    const key = ui.storageDraft.key.trim();
    if (!key) return;
    const ok = writeStorage(ui.storageKind, key, ui.storageDraft.value);
    ctx.toast(ok ? `${key} written` : `Could not write ${key}`, ok ? "good" : "bad");
    ui.storageDraft = { key: "", value: "" };
    ui.storageSelected = key;
    ctx.refresh();
  }
}

/* -------------------------------------------------------------------------- */

function render(ctx: ViewContext): Child {
  const { app, ui } = ctx;
  if (!app && ui.dataPane !== "storage") return noApp(ctx, "The Data view", "data");
  const queries = can(app, "getQueries") ? ctx.cache("queries", () => app.getQueries()) : [];
  const stores = can(app, "getStores") ? ctx.cache("stores", () => app.getStores()) : [];
  let body: Child;
  switch (ui.dataPane) {
    case "stores": body = storesPane(ctx); break;
    case "storage": body = storagePane(ctx); break;
    default: body = queriesPane(ctx);
  }
  return h("div", { class: "dv", "data-dt": "data" },
    viewbar(
      segmented([
        { value: "queries", label: "Queries", icon: "network", count: queries.length || null },
        { value: "stores", label: "Stores & forms", icon: "box", count: stores.length || null },
        { value: "storage", label: "Storage", icon: "data" },
      ], ui.dataPane, (value) => { ui.dataPane = value; ctx.refresh(); }, { label: "Data source" }),
      spacer(),
      queries.some((q) => q.loading) ? h("span", { class: "row-flex t3" }, spinner(), `${queries.filter((q) => q.loading).length} loading`) : null,
      vsep(),
      ui.dataPane === "queries" && can(app, "invalidateQueries") ? button({ label: "Refetch all", size: "sm", icon: "refresh", onClick: () => { for (const q of queries) app!.refetchQuery?.(q.key); ctx.toast(`Refetching ${queries.length} queries`); } }) : null),
    body);
}

export const dataView: ViewDefinition = {
  id: "data",
  label: "Data",
  icon: "data",
  group: "inspect",
  hint: "Queries, stores, forms, and browser storage",
  keywords: "queries cache stores forms localstorage sessionstorage cookies refetch invalidate simulate loading error",
  badge: (ctx) => {
    const app = ctx.app;
    if (!can(app, "getQueries")) return null;
    // Badges render on every event; only re-read the cache when requests or state moved.
    const failing = ctx.memo("data.badge", [app.id, ctx.model.revs.network, ctx.model.revs.state], () => app.getQueries().filter((q) => q.state === "error").length);
    return failing > 0 ? { value: failing, tone: "red" } : null;
  },
  render,
  css: /* css */ `
.dv { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.dv-pane { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.dv-pane > .note { margin: 8px 10px 0; }
.dv-bar { flex: none; display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--dt-border); flex-wrap: wrap; }
.dv-bar > .input:first-child { flex: 1 1 260px; }
.dv-detail { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.dv-actions { flex: none; display: flex; align-items: center; gap: 6px; padding: 8px 12px; flex-wrap: wrap; border-bottom: 1px solid var(--dt-border); }
.dv-methods { display: flex; flex-direction: column; gap: 6px; }
.dv-error { border: 1px solid color-mix(in srgb, var(--dt-red) 35%, transparent); background: var(--dt-red-soft); border-radius: var(--dt-r-md); padding: 4px 0; }
.dv-method { display: flex; align-items: center; gap: 4px; }
.dt-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: none; background: var(--dt-text-4); }
.dt-dot.t-green { background: var(--dt-green); box-shadow: 0 0 0 3px var(--dt-green-soft); }
.dt-dot.t-blue { background: var(--dt-blue); box-shadow: 0 0 0 3px var(--dt-blue-soft); }
.dt-dot.t-red { background: var(--dt-red); box-shadow: 0 0 0 3px var(--dt-red-soft); }
`,
};
