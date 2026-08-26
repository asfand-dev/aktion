/**
 * Routes tab — the router's current state, the routes the program declares, and
 * the navigation history.
 *
 * The declared list comes from a static walk of the `$router({ … })` arms, not
 * from observation, which matters: a router only *discovers* a pattern when it
 * matches, so a history-based view can only ever show you where you have
 * already been. Here every route is clickable from the start, which is how you
 * check a page you have not built a link to yet.
 */

import {
  button, chip, code, defList, emptyState, faint, fmtClock, h, muted, section,
  spacer, stat, statGrid, table, toolbar,
} from "../ui.js";
import { can, type TabContext, type TabDefinition } from "../context.js";

export const routesTab: TabDefinition = {
  id: "routes",
  label: "Routes",
  icon: "⌗",
  hint: "Current route, declared patterns, params, and navigation history",
  badge: (ctx) => (ctx.model.routes.length > 0 ? ctx.model.routes.length : null),
  render: (ctx) => render(ctx),
};

function render(ctx: TabContext): Node[] {
  const { app, model, ui } = ctx;
  if (!can(app, "getRoute")) {
    return [emptyState("This app does not expose its router.")];
  }
  const route = app.getRoute();
  const canNavigate = can(app, "navigate");

  const input = h("input", {
    class: "search",
    placeholder: "/orders/42",
    value: ui.routeDraft,
    style: "max-width:220px",
  }) as HTMLInputElement;
  const go = (): void => {
    const path = input.value.trim();
    if (path === "" || !can(app, "navigate")) return;
    app.navigate(path);
    ui.routeDraft = "";
    ctx.toast(`Navigated to ${path}`);
    ctx.refresh();
  };
  input.addEventListener("input", () => {
    ui.routeDraft = input.value;
  });
  input.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Enter") go();
  });

  const bar = toolbar(
    muted("Navigate"),
    input,
    button("Go", go, { title: "Navigate the app's router (its guard still applies)", disabled: !canNavigate }),
    spacer(),
    chip(route.mode, "blue", "URL strategy"),
    route.guarded ? chip("guarded", "amber", "The program installed a navigation guard, so a navigation can be redirected or refused") : null,
  );

  const current = section("Current route", [
    statGrid(
      stat("path", route.path),
      stat("pattern", route.pattern ?? "—", { title: "The declared arm that matched" }),
      stat("params", String(Object.keys(route.params).length)),
      stat("navigations", String(model.totals.routes)),
    ),
    Object.keys(route.params).length > 0
      ? defList(Object.entries(route.params).map(([key, value]) => [key, code(value)]))
      : faint("This route takes no parameters."),
    route.basePath ? faint(`Served under base path ${route.basePath}`) : null,
  ]);

  const declared = section(`Declared routes (${route.declared.length})`, route.declared.length > 0
    ? h("div", { class: "route-list" }, ...route.declared.map((pattern) => {
        const isActive = pattern === route.pattern;
        const concrete = !pattern.includes(":") && !pattern.includes("*");
        return h("div", { class: `route-row ${isActive ? "is-active" : ""}` },
          h("span", { class: "mono" }, pattern),
          pattern.includes(":") ? chip("params", "grey", "This pattern takes parameters — fill them in above") : null,
          isActive ? chip("active", "green") : null,
          spacer(),
          canNavigate && concrete
            ? button("Go", () => {
                app.navigate!(pattern);
                ctx.toast(`Navigated to ${pattern}`);
                ctx.refresh();
              })
            : null);
      }))
    : faint("No $router({...}) arms found. A single-page program declares no routes."));

  const history = section(`Navigation history (${model.routes.length})`, model.routes.length > 0
    ? table(
        [
          { key: "time", label: "When", render: (row) => faint(fmtClock(Date.now() - (model.lastTime - row.time))) },
          { key: "from", label: "From", render: (row) => code(row.from || "—") },
          { key: "to", label: "To", render: (row) => code(row.to) },
          { key: "pattern", label: "Matched", render: (row) => (row.pattern ? code(row.pattern) : chip("no match", "amber")) },
          {
            key: "params",
            label: "Params",
            render: (row) => {
              const entries = Object.entries(row.params ?? {});
              return entries.length > 0
                ? h("span", { class: "chip-row" }, ...entries.map(([key, value]) => chip(`${key}=${value}`, "grey")))
                : faint("—");
            },
          },
          { key: "source", label: "Source", render: (row) => chip(row.source ?? "?", "blue") },
        ],
        [...model.routes].reverse(),
      )
    : faint("No navigations recorded yet."));

  const unmatched = model.routes.filter((entry) => entry.pattern == null);
  const insight = unmatched.length > 0
    ? section("Insights", h("div", { class: "insight t-warn" },
        h("span", { class: "insight-ic" }, "▲"),
        h("span", {}, `${unmatched.length} navigation${unmatched.length === 1 ? "" : "s"} matched no route arm (${unmatched.slice(-3).map((e) => e.to).join(", ")}). Without a \`default:\` arm the router renders nothing at all for those paths.`)))
    : null;

  return [bar, current, declared, insight, history].filter((node): node is HTMLElement => node != null);
}
