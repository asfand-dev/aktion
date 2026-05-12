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
    events: [{ title: "Event", time: "now", description: "", icon: "🟢", tone: "success" }],
    blockers: [{ title: "Blocker", owner: "Ada", icon: "🛑" }],
  }),
  list_members: () => ({
    rows: [{ id: "u_ada", name: "Ada Lovelace", role: "Engineer", avatar: "", bio: "", tags: ["TS"] }],
    total: 1, pages: 1, popular: [{ name: "Ada" }],
  }),
  get_member: () => ({ id: "", name: "", role: "", bio: "", tags: [], stats: [], avatar: "" }),
  workspace_usage: () => ({ storageUsed: 42, storageMax: 100, seatsUsed: 12, seatsMax: 25, planLabel: "Pro", renews: "Mar 14" }),
  save_settings: () => ({ ok: true }),
  delete_workspace: () => ({ ok: true }),
};

describe("standalone pattern demos", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  const demos: Array<{ file: string; codeId: string; expectSelector: string }> = [
    { file: "project-dashboard.html", codeId: "src-dashboard", expectSelector: ".rui-page-header-title" },
    { file: "marketing-landing.html", codeId: "src-landing",   expectSelector: ".rui-hero-title" },
    { file: "team-directory.html",    codeId: "src-team",      expectSelector: ".rui-page-header-title" },
    { file: "settings-app.html",      codeId: "src-settings",  expectSelector: ".rui-page-header-title" },
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
