#!/usr/bin/env node
/**
 * Render the pull-request comment that shows the component-showcase
 * screenshots, from the manifest scripts/capture-showcase.mjs writes.
 *
 * Usage:
 *   node scripts/showcase-comment.mjs <manifest.json> --assets <base-url>
 *     [--page <showcase-url>] [--commit <sha>] [--run <workflow-run-url>]
 *
 * `--assets` is where the images were uploaded; each file is linked as
 * `<base-url>/<file name>`. The markdown is printed to stdout.
 *
 * The body starts with MARKER: .github/workflows/_screenshots.yml finds its
 * earlier comment by that line and edits it, so a PR carries one screenshot
 * comment that follows every push instead of a new one per push.
 */

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const MARKER = "<!-- showcase-screenshots -->";

/** Phone captures are narrow; shown side by side they read as one overview. */
const NARROW_PX = 600;
const NARROW_DISPLAY_PX = 180;

function parseArgs(argv) {
  const args = { positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag.startsWith("--")) args[flag.slice(2)] = argv[++i];
    else args.positional.push(flag);
  }
  if (!args.positional[0] || !args.assets) {
    console.error("usage: node scripts/showcase-comment.mjs <manifest.json> --assets <base-url> [--page url] [--commit sha] [--run url]");
    process.exit(2);
  }
  return args;
}

const fmt = (n) => n.toLocaleString("en-US");
const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export function renderComment(manifest, { assets, page, commit, run }) {
  const base = assets.replace(/\/+$/, "");
  const out = [MARKER, "### Component showcase", ""];

  const where = page ? `[component showcase](${page})` : "component showcase";
  // A bare SHA is auto-linked by GitHub; backticks would stop that.
  const at = commit ? ` at ${commit.slice(0, 7)}` : "";
  out.push(`Full-page screenshots of the ${where} from this pull request's preview${at}. This comment is updated on every push.`, "");

  manifest.variants.forEach((variant, index) => {
    const parts = variant.files.length;
    const size = `${fmt(variant.width)} × ${fmt(variant.height)} px${parts > 1 ? `, ${parts} images` : ""}`;
    out.push(`<details${index === 0 ? " open" : ""}>`);
    out.push(`<summary><b>${escapeHtml(variant.label)}</b> · ${size}</summary>`, "");
    const narrow = variant.width <= NARROW_PX;
    // No whitespace between the tags: full-width segments then stack into one
    // continuous page, and narrow ones sit side by side, read left to right.
    const images = variant.files.map((file, i) => {
      const alt = escapeHtml(`Component showcase, ${variant.label}${parts > 1 ? `, part ${i + 1} of ${parts}` : ""}`);
      // align="top": the last part is shorter, and inline images otherwise
      // line up by their bottom edge.
      const sizing = narrow ? ` width="${NARROW_DISPLAY_PX}" align="top"` : "";
      return `<img src="${base}/${encodeURIComponent(file.name)}" alt="${alt}"${sizing}>`;
    });
    out.push(images.join(""), "");
    if (narrow && parts > 1) out.push("<sub>Read the columns left to right; open an image for full size.</sub>", "");
    out.push("</details>", "");
  });

  const notReady = manifest.variants.filter((v) => v.state !== "ready");
  const problems = manifest.variants.flatMap((v) => v.problems.map((p) => `${v.id}: ${p}`));
  if (notReady.length > 0 || problems.length > 0) {
    out.push("> [!WARNING]");
    for (const v of notReady) out.push(`> ${escapeHtml(v.label)} never signalled that it finished rendering (${v.state}); that capture may be incomplete.`);
    if (problems.length > 0) {
      out.push(`> The page logged ${problems.length} error${problems.length === 1 ? "" : "s"} while rendering:`);
      for (const p of problems.slice(0, 10)) out.push(`> - ${escapeHtml(p.slice(0, 300))}`);
      if (problems.length > 10) out.push(`> - …and ${problems.length - 10} more`);
    }
    out.push("");
  }

  const how = run ? `[this workflow run](${run})` : "the screenshots workflow";
  out.push(`<sub>Captured by scripts/capture-showcase.mjs in ${how}, at 1× scale with a page-tall viewport. A page taller than 16,000 px is captured in consecutive parts.</sub>`);
  return `${out.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(args.positional[0], "utf8"));
  process.stdout.write(renderComment(manifest, args));
}

// Run only as a CLI, so renderComment stays importable.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
