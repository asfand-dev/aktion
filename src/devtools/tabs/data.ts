/**
 * Data tab — the layers between the program and its data: cached queries,
 * global stores and forms, and browser storage.
 *
 * These are the three places state hides where the State tab cannot show it
 * usefully. A `$query` resource lives in a shared cache keyed by URL, not in an
 * atom. A `Store({...})` keeps everything in one machine-named atom
 * (`__store_3_10`), so the State tab shows a name nobody wrote. And
 * `localStorage` is not reactive at all, so nothing in the app reflects it until
 * something reads it — which is exactly why a stale key is such a common bug.
 */

import {
  button, chip, chipGroup, code, copyButton, editableValue, emptyState, faint,
  fmtBytes, h, muted, section, spacer, stat, statGrid, table, textField,
  toolbar, truncateMiddle, urlPath, valueSpan,
} from "../ui.js";
import { can, type TabContext, type TabDefinition } from "../context.js";
import { newRule } from "../rules.js";
import type { QueryInfo, StoreInfo } from "../protocol.js";

export const dataTab: TabDefinition = {
  id: "data",
  label: "Data",
  icon: "⛁",
  hint: "Cached queries, global stores and forms, and browser storage",
  badge: (ctx) => {
    if (!can(ctx.app, "getQueries")) return null;
    const loading = ctx.app.getQueries().filter((query) => query.loading).length;
    return loading > 0 ? loading : null;
  },
  render: (ctx) => render(ctx),
};

function render(ctx: TabContext): Node[] {
  const { ui } = ctx;
  const bar = toolbar(
    chipGroup(
      [
        { value: "queries" as const, label: "Queries", title: "$query / Http({...}) resource cache" },
        { value: "stores" as const, label: "Stores & forms", title: "Store({...}) and $form({...}) handles" },
        { value: "storage" as const, label: "Storage", title: "localStorage, sessionStorage, and cookies" },
      ],
      ui.dataPane,
      (value) => {
        ui.dataPane = value;
        ctx.refresh();
      },
    ),
    spacer(),
  );

  switch (ui.dataPane) {
    case "queries": return [bar, ...renderQueries(ctx)];
    case "stores": return [bar, ...renderStores(ctx)];
    case "storage": return [bar, ...renderStorage(ctx)];
  }
}

/* -------------------------------------------------------------------------- */
/*  Queries                                                                    */
/* -------------------------------------------------------------------------- */

function renderQueries(ctx: TabContext): Node[] {
  const { app } = ctx;
  if (!can(app, "getQueries")) {
    return [emptyState("This runtime does not expose its query cache.")];
  }
  const queries = app.getQueries();
  if (queries.length === 0) {
    return [emptyState(
      "No cached queries.",
      "A $query({...}) or Http({...}) resource appears here as soon as the program creates one.",
    )];
  }

  const loading = queries.filter((query) => query.loading).length;
  const failed = queries.filter((query) => query.error !== undefined).length;
  const stale = queries.filter((query) => query.state === "stale").length;

  let invalidatePattern = "";
  const invalidate = (): void => {
    const pattern = invalidatePattern.trim();
    if (pattern === "" || !can(app, "invalidateQueries")) return;
    app.invalidateQueries(pattern);
    ctx.toast(`Invalidated queries matching "${pattern}"`);
    ctx.refresh();
  };
  const invalidateInput = textField({
    focusKey: "invalidate",
    placeholder: "/api/todos",
    width: "200px",
    onInput: (value) => { invalidatePattern = value; },
    onEnter: invalidate,
  });

  const rows = queries.map((query) => renderQueryRow(ctx, query));

  return [
    section("Summary", statGrid(
      stat("cached", String(queries.length)),
      stat("loading", String(loading), { tone: loading > 0 ? "warn" : undefined }),
      stat("failed", String(failed), { tone: failed > 0 ? "bad" : "good" }),
      stale > 0 ? stat("stale", String(stale)) : null,
    )),
    section("Invalidate by key", h("div", { class: "detail-head" },
      invalidateInput,
      button("Invalidate", invalidate, {
        title: "Refetch every cached query whose key contains this substring",
      }),
      spacer(),
      faint("Matching is substring-based, so /api/posts refreshes every page and filtered variant."),
    )),
    section(`Resources (${queries.length})`, h("div", { class: "prop-list" }, ...rows), { flush: true }),
  ];
}

function renderQueryRow(ctx: TabContext, query: QueryInfo): HTMLElement {
  const { app, ui } = ctx;
  const expanded = ui.dataExpanded.has(query.key);
  const tone = query.error !== undefined
    ? "red"
    : query.loading ? "amber" : query.state === "stale" ? "grey" : "green";

  return h("div", { class: "data-row" },
    h("div", { class: "data-head" },
      h("span", {
        class: "twist",
        onclick: () => {
          if (expanded) ui.dataExpanded.delete(query.key);
          else ui.dataExpanded.add(query.key);
          ctx.refresh();
        },
      }, expanded ? "▾" : "▸"),
      chip(query.state, tone),
      h("span", { class: "mono", title: query.key }, truncateMiddle(query.key, 52)),
      query.status !== undefined ? chip(String(query.status), query.status >= 400 ? "red" : "blue") : null,
      query.infinite ? chip(`page ${query.page ?? 0}${query.hasMore ? "+" : ""}`, "purple") : null,
      spacer(),
      query.lastUpdated ? faint(new Date(query.lastUpdated).toLocaleTimeString()) : null,
      can(app, "refetchQuery")
        ? button("Refetch", () => {
            app.refetchQuery(query.key);
            ctx.toast("Refetching…");
            ctx.refresh();
          }, { title: "Re-run this request now" })
        : null,
      query.loading && can(app, "cancelQuery")
        ? button("Cancel", () => {
            app.cancelQuery(query.key);
            ctx.toast("Cancelled");
            ctx.refresh();
          }, { tone: "warn" })
        : null,
      // The two experiments you want on a cached query are "what if it were slow"
      // and "what if it failed". Both live in the Network tab's rules, so offer
      // them from here rather than making you copy the URL across.
      can(app, "setNetworkRules")
        ? button("Mock", () => seedRule(ctx, query, "mock"), {
            title: "Answer this request with a canned response (opens the Network tab)",
          })
        : null,
      can(app, "setNetworkRules")
        ? button("Slow", () => seedRule(ctx, query, "delay"), {
            title: "Add 2s of latency to this request, to see your own loading state",
          })
        : null,
      can(app, "setNetworkRules")
        ? button("Fail", () => seedRule(ctx, query, "fail"), {
            title: "Make this request fail, to exercise the error path",
          })
        : null),
    expanded
      ? h("div", { class: "data-body" },
          query.error !== undefined
            ? h("div", { class: "banner t-red" }, query.error.preview)
            : null,
          h("div", { class: "detail-head" },
            muted("data"),
            spacer(),
            query.data.json !== undefined ? copyButton(() => query.data.json!, "Copy") : null),
          query.data.json !== undefined
            ? h("pre", { class: "code-pre" }, query.data.json)
            : valueSpan(query.data))
      : null,
  );
}

/**
 * Seed a network rule for a cached query and hand the user to the Network tab.
 *
 * A query's cache key starts with its method and URL, which is exactly what a
 * rule matches on — so the bridge is a substring extraction, and the user never
 * has to copy a URL between tabs.
 */
function seedRule(ctx: TabContext, query: QueryInfo, action: "mock" | "delay" | "fail"): void {
  if (!can(ctx.app, "setNetworkRules")) return;
  const url = query.key.replace(/^[A-Z]+\s+/, "").split(/\s+/)[0] ?? query.key;
  const pattern = urlPath(url) || url;
  const rule = newRule(
    action === "mock"
      ? {
          action,
          pattern,
          status: query.status ?? 200,
          // Seed the mock with the response the app already has: editing a real
          // payload is far easier than writing one from nothing.
          body: query.data.json ?? "",
          label: `mock ${pattern}`,
        }
      : action === "delay"
        ? { action, pattern, delayMs: 2000, label: `slow ${pattern}` }
        : { action, pattern, message: "Request failed (DevTools rule)", label: `fail ${pattern}` },
  );
  ctx.ui.rules = [...ctx.ui.rules, rule];
  ctx.app.setNetworkRules(ctx.ui.rules);
  ctx.ui.showRules = true;
  ctx.toast(`Rule added for ${pattern} — refetch to see it`);
  ctx.selectTab("network");
}

/* -------------------------------------------------------------------------- */
/*  Stores + forms                                                             */
/* -------------------------------------------------------------------------- */

function renderStores(ctx: TabContext): Node[] {
  const { app, ui } = ctx;
  if (!can(app, "getStores")) {
    return [emptyState("This runtime does not expose its stores.")];
  }
  const stores = app.getStores();
  if (stores.length === 0) {
    return [emptyState(
      "No stores or forms.",
      "A Store({...}) or $form({...}) handle appears here as soon as the program creates one.",
    )];
  }
  return [
    section("Summary", statGrid(
      stat("stores", String(stores.filter((store) => store.flavour === "store").length)),
      stat("forms", String(stores.filter((store) => store.flavour === "form").length)),
    )),
    ...stores.map((store) => renderStore(ctx, store, ui.dataExpanded.has(store.atom))),
  ];
}

function renderStore(ctx: TabContext, store: StoreInfo, expanded: boolean): HTMLElement {
  const { app, ui } = ctx;
  return section(null, [
    h("div", { class: "data-head" },
      h("span", {
        class: "twist",
        onclick: () => {
          if (expanded) ui.dataExpanded.delete(store.atom);
          else ui.dataExpanded.add(store.atom);
          ctx.refresh();
        },
      }, expanded ? "▾" : "▸"),
      chip(store.flavour, store.flavour === "form" ? "purple" : "blue"),
      code(store.atom),
      store.source ? faint(`L${store.source.line}:${store.source.column}`) : null,
      spacer(),
      muted(`${store.methods.length} method${store.methods.length === 1 ? "" : "s"}`)),
    expanded
      ? h("div", { class: "data-body" },
          store.value.json !== undefined
            ? h("pre", { class: "code-pre" }, store.value.json)
            : valueSpan(store.value),
          store.methods.length > 0
            ? h("div", { class: "chip-row" }, ...store.methods.map((method) =>
                can(app, "callStoreMethod")
                  ? h("button", {
                      class: "chip green is-link",
                      title: `Call ${method}() with no arguments`,
                      onclick: () => {
                        const result = app.callStoreMethod(store.atom, method);
                        ctx.toast(result.ok ? `${method}() → ${result.value?.preview ?? "ok"}` : (result.error ?? "failed"), result.ok ? "good" : "bad");
                        ctx.refresh();
                      },
                    }, `${method}()`)
                  : chip(`${method}()`, "grey")))
            : null,
          faint("Calling a method here runs the author's function with the handle injected, exactly as the program would."))
      : null,
  ], { flush: true });
}

/* -------------------------------------------------------------------------- */
/*  Browser storage                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Browser storage is read directly from the page rather than through the app.
 *
 * The `storage` namespace is a thin wrapper over the same three mechanisms, so
 * there is nothing app-specific to ask for — and reading them here means the
 * view is correct even for keys the program has never touched, which is where
 * the stale-value bugs live.
 */
function renderStorage(ctx: TabContext): Node[] {
  const { ui } = ctx;
  const kinds = [
    { value: "local" as const, label: "localStorage", title: "Persists across sessions" },
    { value: "session" as const, label: "sessionStorage", title: "Cleared when the tab closes" },
    { value: "cookies" as const, label: "cookies", title: "Sent with every request to the origin" },
  ];

  const entries = readStorage(ui.storageKind);
  const bytes = entries.reduce((sum, entry) => sum + entry.key.length + entry.value.length, 0);

  const bar = toolbar(
    chipGroup(kinds, ui.storageKind, (value) => {
      ui.storageKind = value;
      ctx.refresh();
    }),
    spacer(),
    muted(`${entries.length} key${entries.length === 1 ? "" : "s"} · ${fmtBytes(bytes)}`),
  );

  const label = ui.storageKind === "cookies" ? "cookies" : `${ui.storageKind}Storage`;
  const adder = renderStorageAdder(ctx);

  if (entries.length === 0) {
    return [
      bar,
      emptyState(
        `Nothing in ${label}.`,
        "Anything the program writes through the `storage` namespace shows up here — and you can add a key yourself to test how the app reads it.",
      ),
      adder,
    ];
  }

  return [
    bar,
    section(null, table(
      [
        { key: "key", label: "Key", sort: (row) => row.key, render: (row) => code(row.key) },
        {
          key: "value",
          label: "Value",
          // Editable in place: the common use is not reading a stored value but
          // changing it to see how the app behaves on the next read.
          render: (row) => editableValue(
            { type: "string", preview: truncateMiddle(row.value, 80), json: JSON.stringify(row.value) },
            (next) => {
              const written = writeStorage(ui.storageKind, row.key, typeof next === "string" ? next : JSON.stringify(next));
              ctx.toast(written ? `${row.key} updated` : `could not write ${row.key}`, written ? "good" : "bad");
              ctx.refresh();
            },
            { focusKey: `storage:${ui.storageKind}:${row.key}`, title: row.value },
          ),
        },
        { key: "size", label: "Size", numeric: true, sort: (row) => row.value.length, render: (row) => fmtBytes(row.value.length) },
        {
          key: "actions",
          label: "",
          render: (row) => h("span", { class: "chip-row" },
            copyButton(() => row.value, "Copy"),
            button("✕", () => {
              removeStorage(ui.storageKind, row.key);
              ctx.toast(`Removed ${row.key}`);
              ctx.refresh();
            }, { title: "Remove this key" })),
        },
      ],
      entries,
    ), { flush: true }),
    adder,
    section(null, faint(
      "Aktion's `storage` namespace round-trips non-string values through JSON, so a value that looks like JSON here is what the program reads back as an object. Nothing in the app re-reads storage on its own — force a render after an edit.",
    ), { flush: true }),
  ];
}

/** Add (or overwrite) a storage key, for testing what the app reads back. */
function renderStorageAdder(ctx: TabContext): HTMLElement {
  const { ui } = ctx;
  let key = "";
  let value = "";
  const write = (): void => {
    const name = key.trim();
    if (name === "") return;
    const ok = writeStorage(ui.storageKind, name, value);
    ctx.toast(ok ? `${name} written` : `could not write ${name}`, ok ? "good" : "bad");
    ctx.refresh();
  };
  return section(null, h("div", { class: "detail-head" },
    muted("Add a key"),
    textField({
      focusKey: `storage-new-key:${ui.storageKind}`,
      placeholder: "key",
      width: "150px",
      onInput: (next) => { key = next; },
    }),
    textField({
      focusKey: `storage-new-value:${ui.storageKind}`,
      placeholder: 'value — plain text, or JSON like {"seen":true}',
      onInput: (next) => { value = next; },
      onEnter: write,
    }),
    button("Write", write, { title: "Set this key in the selected store" }),
  ), { flush: true });
}

interface StorageEntry {
  key: string;
  value: string;
}

function readStorage(kind: "local" | "session" | "cookies"): StorageEntry[] {
  try {
    if (kind === "cookies") {
      const raw = typeof document !== "undefined" ? document.cookie : "";
      if (!raw) return [];
      return raw.split(";").map((pair) => {
        const index = pair.indexOf("=");
        const key = (index < 0 ? pair : pair.slice(0, index)).trim();
        const value = index < 0 ? "" : decodeURIComponent(pair.slice(index + 1).trim());
        return { key, value };
      }).filter((entry) => entry.key !== "");
    }
    const store = kind === "local" ? globalThis.localStorage : globalThis.sessionStorage;
    if (!store) return [];
    const out: StorageEntry[] = [];
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key === null) continue;
      out.push({ key, value: store.getItem(key) ?? "" });
    }
    return out.sort((a, b) => a.key.localeCompare(b.key));
  } catch {
    // Private mode, a blocked origin, or a disabled storage API.
    return [];
  }
}

/**
 * Write one storage key. Returns `false` when the browser refused (quota,
 * private mode, a disabled API) rather than throwing into the render.
 */
function writeStorage(kind: "local" | "session" | "cookies", key: string, value: string): boolean {
  try {
    if (kind === "cookies") {
      document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; path=/`;
      return true;
    }
    const store = kind === "local" ? globalThis.localStorage : globalThis.sessionStorage;
    if (!store) return false;
    store.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeStorage(kind: "local" | "session" | "cookies", key: string): void {
  try {
    if (kind === "cookies") {
      document.cookie = `${encodeURIComponent(key)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      return;
    }
    const store = kind === "local" ? globalThis.localStorage : globalThis.sessionStorage;
    store?.removeItem(key);
  } catch {
    /* nothing we can do; the row will simply still be there */
  }
}


