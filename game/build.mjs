#!/usr/bin/env node
/**
 * Merge game/_authored/NN-<id>.json into game/games.json.
 *
 *   node game/build.mjs
 *
 * The per-game files are the editable source; games.json is the artefact the
 * runtime fetches. Keeping them apart means an LLM can author one world without
 * ever re-emitting (or corrupting) the rest of the bundle.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "_authored");

const META = {
  title: "Aktion Quest",
  tagline: "learn by playing",
  blurb:
    "Aktion is a streaming, reactive DSL: plain-JavaScript-looking statements that a single web component turns into live UI. Twelve worlds take you from your first $app(...) to the traps the validator cannot catch.",
  backdrop: { preset: "starfield" },
};

const CONFIG = {
  xpPerStage: 100,
  hintCost: 15,
  livePreview: true,
  liveValidation: true,
  aktionSources: ["../dist/aktion.js", "https://esm.sh/aktion-runtime@0.6.5"],
  aktionLanguageSources: ["../dist/language.js", "https://esm.sh/aktion-runtime@0.6.5/language"],
};

const TRACKS = [
  {
    id: "foundations",
    title: "Foundations",
    blurb: "The shape of every Aktion program: one root, reactive names, your own components, and layouts that look finished.",
    games: ["first-light", "reactive-pulse", "component-forge", "layout-architect"],
  },
  {
    id: "logic-and-data",
    title: "Logic & Data",
    blurb: "Where expressions end and statements begin, how data arrives, and how side effects clean up after themselves.",
    games: ["flow-control", "data-stream", "effects-lifecycle"],
  },
  {
    id: "applications",
    title: "Real Applications",
    blurb: "Many pages, deeper state, forms that validate themselves, and a program that survives all six themes.",
    games: ["routers-path", "state-deep", "forms-forge", "theme-polish"],
  },
  {
    id: "mastery",
    title: "Mastery",
    blurb: "Programs that pass the validator and behave wrong anyway.",
    games: ["master-trials"],
  },
];

const files = readdirSync(src).filter((f) => f.endsWith(".json")).sort();
const games = [];
const problems = [];

for (const f of files) {
  let g;
  try {
    g = JSON.parse(readFileSync(join(src, f), "utf8"));
  } catch (err) {
    problems.push(`${f}: not valid JSON — ${err.message}`);
    continue;
  }
  if (Array.isArray(g)) { problems.push(`${f}: is an array, expected one game object`); continue; }
  if (g.games) { problems.push(`${f}: is a bundle, expected one game object`); continue; }
  if (!g.id) { problems.push(`${f}: no id`); continue; }
  games.push(g);
}

// Keep only the tracks that actually have content, and warn about orphans.
const known = new Set(games.map((g) => g.id));
const placed = new Set();
const tracks = TRACKS.map((t) => {
  const list = t.games.filter((id) => known.has(id));
  list.forEach((id) => placed.add(id));
  return { ...t, games: list };
}).filter((t) => t.games.length);

const orphans = games.map((g) => g.id).filter((id) => !placed.has(id));
if (orphans.length) {
  tracks.push({ id: "extra", title: "More worlds", games: orphans });
  problems.push(`not in any track (added to "More worlds"): ${orphans.join(", ")}`);
}

// Order games by track order so "continue" walks the intended path.
const order = tracks.flatMap((t) => t.games);
games.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

for (const g of games) {
  for (const req of g.requires || []) {
    if (!known.has(req)) problems.push(`${g.id}: requires missing game "${req}"`);
    else if (order.indexOf(req) > order.indexOf(g.id)) problems.push(`${g.id}: requires "${req}" which comes later`);
  }
}

const bundle = { $schema: "aktion-quest/1", meta: META, config: CONFIG, tracks, games };
writeFileSync(join(here, "games.json"), JSON.stringify(bundle, null, 2) + "\n");

const ALL_TYPES = ["quiz", "fill-blanks", "order-lines", "bug-hunt", "match-pairs", "sort-bins",
  "switchboard", "sequence-tap", "hotspot", "type-code", "arcade"];

const stages = games.reduce((n, g) => n + (g.stages?.length || 0), 0);
const used = games.flatMap((g) => (g.stages || []).map((s) => s.challenge?.type));
console.log(`games.json — ${games.length} games · ${stages} stages · ${new Set(used).size}/${ALL_TYPES.length} challenge types`);
for (const g of games) console.log(`  ${g.id.padEnd(20)} ${String(g.stages?.length ?? 0).padStart(2)} stages  ${(g.stages || []).map((s) => s.challenge?.type).join(", ")}`);

// Bundle-wide histogram: the number authors should look at before picking engines.
console.log("\nchallenge-type spread across the bundle:");
const max = Math.max(1, ...ALL_TYPES.map((t) => used.filter((u) => u === t).length));
for (const t of ALL_TYPES) {
  const n = used.filter((u) => u === t).length;
  const bar = "█".repeat(Math.round((n / max) * 22));
  console.log(`  ${t.padEnd(13)} ${String(n).padStart(2)} ${bar}${n === 0 ? "  <- unused" : n <= 2 ? "  <- thin" : ""}`);
}
if (problems.length) {
  console.log("\nproblems:");
  for (const p of problems) console.log("  ! " + p);
  process.exitCode = 1;
}
