/**
 * Smoke tests for the standalone demo pages. We parse and evaluate the actual
 * UI Script source embedded in each <code id="src-..."> block to guarantee
 * the demos stay syntactically valid as the language evolves.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import "../src/index.js";

const flush = () => new Promise<void>((resolve) => queueMicrotask(() => resolve()));

const repoRoot = resolve(__dirname, "..");

type StreamingEl = HTMLElement & {
  setResponse(text: string): void;
  setTools(tools: Record<string, (args: Record<string, unknown>) => unknown>): void;
  showErrors: boolean;
};

function extractSource(file: string, codeId: string): string {
  const html = readFileSync(resolve(repoRoot, "docs", file), "utf8");
  const re = new RegExp(`<code id="${codeId}">([\\s\\S]*?)</code>`);
  const match = html.match(re);
  if (!match) throw new Error(`Could not find <code id="${codeId}"> in ${file}`);
  return match[1]
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');
}

function makeElement(): StreamingEl {
  const el = document.createElement("streaming-ui-script") as StreamingEl;
  el.showErrors = true;
  document.body.appendChild(el);
  return el;
}

const noopTools: Record<string, (args: Record<string, unknown>) => unknown> = {
  program_summary: () => ({
    shipped: 12, inReview: 8, blocked: 2, velocity: 42,
    deltas: { shipped: "+2", review: "0", blocked: "-1", velocity: "+3" },
    columns: [
      { title: "Backlog", tone: "default", cards: [{ title: "Item A", description: "", tags: [], assignee: "", tone: "default", icon: "" }] },
    ],
    events: [{ title: "Event", time: "now", description: "", icon: "circle-check", tone: "success" }],
    blockers: [{ title: "Blocker", owner: "Ada", icon: "circle-stop" }],
  }),
  list_members: () => ({
    rows: [{ id: "u_ada", name: "Ada Lovelace", role: "Engineer", avatar: "", bio: "", tags: ["TS"] }],
    total: 1, pages: 1, popular: [{ name: "Ada" }],
  }),
  get_member: () => ({ id: "", name: "", role: "", bio: "", tags: [], stats: [], avatar: "" }),
  workspace_usage: () => ({ storageUsed: 42, storageMax: 100, seatsUsed: 12, seatsMax: 25, planLabel: "Pro", renews: "Mar 14" }),
  save_settings: () => ({ ok: true }),
  delete_workspace: () => ({ ok: true }),
  status_summary: () => ({
    overall: "operational",
    message: "All systems are operating normally.",
    uptime: "99.99%",
    incidentCount: 1,
    avgLatency: "182 ms",
    servicesDown: 0,
    servicesTotal: 6,
    latency: { times: ["00:00", "06:00", "12:00", "18:00"], values: [180, 200, 210, 195] },
    services: [
      { id: "auth", name: "Auth API", region: "US East", tone: "success", uptime: "99.99%" },
    ],
    incidents: [
      {
        id: "inc-1", title: "Sample incident", time: "1h ago",
        description: "Brief blip resolved.", status: "Resolved", tone: "success",
        icon: "circle-check", severity: "Sev 4", component: "api · us-east",
        owner: "Naomi Rivers",
        updates: [{ author: "Naomi Rivers", body: "Resolved.", time: "1h ago" }],
      },
    ],
  }),
  ship_quote: () => ({ price: 4.99, eta: "5-7 business days" }),
  storage_usage: () => ({ used: 12.4, total: 15, percent: 83, label: "Pro · renews Mar 14" }),
  agenda_for: () => ({
    day: "Tuesday, May 13",
    rows: [
      {
        id: "standup", time: "9:00 AM", duration: "25 min", title: "Engineering standup",
        category: "meetings", icon: "users", tone: "primary", location: "Zoom",
        attendeeSummary: "Naomi & Linus +3", relative: "starts soon", unread: true,
        joinUrl: "https://zoom.us/standup", summary: "Daily sync",
        host: "Naomi Rivers", calendar: "Team standups", statusLabel: "Confirmed",
        agenda: ["Wins", "Plan", "Blockers"],
        attendees: [{ name: "Naomi", role: "VP", avatar: "", online: true }],
      },
    ],
    busyMinutes: 25, totalMinutes: 540, busyPercent: 5,
    freeBlocks: [{ label: "10:00 AM – 12:00 PM", duration: "2h" }],
    weekStats: { meetings: 8, focus: 3, deepWork: "6h", attendees: 24 },
  }),
};

describe("standalone pattern demos", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  const demos: Array<{ file: string; codeId: string; expectSelector: string }> = [
    { file: "project-dashboard.html", codeId: "src-dashboard", expectSelector: ".rui-page-header-title" },
    { file: "marketing-landing.html", codeId: "src-landing",   expectSelector: ".rui-hero-title" },
    { file: "team-directory.html",    codeId: "src-team",      expectSelector: ".rui-page-header-title" },
    { file: "settings-app.html",      codeId: "src-settings",  expectSelector: ".rui-page-header-title" },
    { file: "ecommerce-product.html", codeId: "src-product",   expectSelector: ".rui-split-view" },
    { file: "inbox-app.html",         codeId: "src-inbox",     expectSelector: ".rui-page-header-title" },
    { file: "pricing-page.html",      codeId: "src-pricing",   expectSelector: ".rui-cover-title" },
    { file: "crm-contacts.html",      codeId: "src-crm",       expectSelector: ".rui-page-header-title" },
    { file: "status-page.html",       codeId: "src-status",    expectSelector: ".rui-page-header-title" },
    { file: "checkout-flow.html",     codeId: "src-checkout",  expectSelector: ".rui-page-header-title" },
    { file: "file-manager.html",      codeId: "src-files",     expectSelector: ".rui-page-header-title" },
    { file: "calendar-app.html",      codeId: "src-calendar",  expectSelector: ".rui-page-header-title" },
    { file: "docs-portal.html",       codeId: "src-docs",      expectSelector: ".rui-page-header-title" },
    { file: "brand-themes.html",      codeId: "src-shared",    expectSelector: ".rui-page-header-title" },
  ];

  for (const { file, codeId, expectSelector } of demos) {
    it(`${file} renders without parse errors`, async () => {
      const el = makeElement();
      el.setTools(noopTools);
      const errors: unknown[] = [];
      el.addEventListener("error", (e) => errors.push(e));

      el.setResponse(extractSource(file, codeId));
      for (let i = 0; i < 10; i += 1) await flush();

      const banner = el.shadowRoot!.querySelector(".rui-error-banner") as HTMLElement | null;
      const bannerVisible = banner && !banner.hidden;
      if (bannerVisible) {
        const detail = banner!.textContent ?? "(no message)";
        throw new Error(`${file}: parse error banner is visible — ${detail}`);
      }
      expect(errors).toEqual([]);
      expect(el.shadowRoot!.querySelector(expectSelector)).not.toBeNull();
    });
  }
});
