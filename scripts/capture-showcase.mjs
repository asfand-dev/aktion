#!/usr/bin/env node
/**
 * Capture full-page screenshots of the component showcase (docs/showcase.html)
 * for the pull-request comment posted by .github/workflows/_screenshots.yml.
 *
 * Usage:
 *   node scripts/capture-showcase.mjs <showcase-url> [out-dir] [--prefix name]
 *
 *   # locally, against the dev server (`npm run dev` serves the repo root):
 *   node scripts/capture-showcase.mjs http://localhost:5173/docs/showcase.html
 *
 * Writes the JPEGs for every variant below plus `manifest.json`, which
 * scripts/showcase-comment.mjs turns into the PR comment.
 *
 * How a capture works, and why:
 *
 *  - The viewport is resized to the full height of the page before capturing.
 *    Chrome's own "full page" mode paints what lies beyond the viewport
 *    without ever bringing it on screen, and some content only paints on
 *    screen: the Map's cross-origin iframe came back blank, and lazy images
 *    and IntersectionObserver-driven components (Reveal, OnIntersect,
 *    InfiniteList) never trigger. With a page-tall viewport everything is on
 *    screen at once. Viewport-pinned elements (the floating buttons) then sit
 *    at the bottom corners of the whole page.
 *  - Chromium cannot capture more than 16,384 device pixels in one go; past
 *    that a capture silently wraps and repeats the top of the page (measured).
 *    So captures run at a device scale factor of 1, and a taller page is
 *    captured as consecutive segments of at most 16,000 px.
 *  - GitHub's image proxy refuses to show anything over 5 MB in a comment, so
 *    images are JPEG, and the quality steps down until a file fits.
 *
 * Browser: the system Google Chrome (preinstalled on GitHub's Ubuntu runners
 * and on most dev machines) through playwright-core, falling back to
 * Playwright's own Chromium if `npx playwright install chromium` was run.
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const MAX_SEGMENT_PX = 16000; // headroom under Chromium's 16,384 px ceiling
const MAX_BYTES = 4.8 * 1024 * 1024; // GitHub's camo proxy refuses > 5 MB
const QUALITY_STEPS = [80, 70, 60, 50, 40];
const READY_TIMEOUT_MS = 45000;

/** What gets captured. The first one is the screenshot shown expanded. */
const VARIANTS = [
  { id: "desktop-light", label: "Desktop · light theme", theme: "light", width: 1440, height: 900 },
  { id: "desktop-dark", label: "Desktop · dark theme", theme: "dark", width: 1440, height: 900 },
  { id: "mobile-light", label: "Mobile · light theme", theme: "light", width: 390, height: 844, mobile: true },
];

function parseArgs(argv) {
  const args = { prefix: "showcase", positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--prefix") args.prefix = argv[++i];
    else args.positional.push(argv[i]);
  }
  const [url, outDir = "screenshots"] = args.positional;
  if (!url) {
    console.error("usage: node scripts/capture-showcase.mjs <showcase-url> [out-dir] [--prefix name]");
    process.exit(2);
  }
  // Asset names end up in URLs; keep them to a safe alphabet.
  return { url, outDir: resolve(outDir), prefix: args.prefix.replace(/[^A-Za-z0-9._-]/g, "-") };
}

async function launch() {
  try {
    return await chromium.launch({ channel: "chrome" });
  } catch (err) {
    console.warn(`System Chrome unavailable (${err.message.split("\n")[0]}); trying Playwright's Chromium.`);
    return chromium.launch();
  }
}

/**
 * `capture=1` asks the page for its screenshot state: lazy media switched to
 * eager, and the transient states a visitor would trigger by hand (an open
 * menu, a failed validation) pre-rendered. See docs/showcase.aktion.
 */
function captureUrl(url, theme) {
  const next = new URL(url);
  next.searchParams.set("theme", theme);
  next.searchParams.set("capture", "1");
  return next.href;
}

const pageHeight = (page) => page.evaluate(() => document.documentElement.scrollHeight);

/**
 * Grow the viewport until it is as tall as the page. Repeated because a
 * taller viewport can itself change the height (anything sized in vh, or
 * content an IntersectionObserver reveals once it is on screen).
 */
async function fitViewportToPage(page, width) {
  let height = await pageHeight(page);
  for (let pass = 0; pass < 5; pass += 1) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(500);
    const next = await pageHeight(page);
    if (next === height) break;
    height = next;
  }
  return height;
}

async function captureVariant(browser, variant, { url, outDir, prefix }) {
  const context = await browser.newContext({
    viewport: { width: variant.width, height: variant.height },
    deviceScaleFactor: 1,
    isMobile: Boolean(variant.mobile),
    hasTouch: Boolean(variant.mobile),
    colorScheme: variant.theme === "dark" ? "dark" : "light",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(`console: ${msg.text()}`);
  });

  await page.goto(captureUrl(url, variant.theme), { waitUntil: "load", timeout: 60000 });
  const state = await page
    .waitForFunction(() => document.documentElement.dataset.showcase !== "loading", null, { timeout: READY_TIMEOUT_MS })
    .then(() => page.evaluate(() => document.documentElement.dataset.showcase))
    .catch(() => "no-signal");
  if (state !== "ready") console.warn(`[${variant.id}] page never signalled ready (${state}); capturing anyway.`);

  // Opening the page up to its full height brings everything on screen at
  // once; give the media that only now started loading time to arrive.
  const height = await fitViewportToPage(page, variant.width);
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1000);

  const files = [];
  const count = Math.ceil(height / MAX_SEGMENT_PX);
  for (let index = 0; index < count; index += 1) {
    const y = index * MAX_SEGMENT_PX;
    const segmentHeight = Math.min(MAX_SEGMENT_PX, height - y);
    const name = `${prefix}-${variant.id}${count > 1 ? `-part${index + 1}` : ""}.jpg`;
    let buffer;
    let quality;
    for (quality of QUALITY_STEPS) {
      buffer = await page.screenshot({
        type: "jpeg",
        quality,
        animations: "disabled",
        caret: "hide",
        clip: { x: 0, y, width: variant.width, height: segmentHeight },
      });
      if (buffer.length <= MAX_BYTES) break;
    }
    await writeFile(resolve(outDir, name), buffer);
    files.push({ name, y, height: segmentHeight, bytes: buffer.length, quality });
    console.log(`[${variant.id}] ${name}: ${variant.width}x${segmentHeight}, ${(buffer.length / 1024 / 1024).toFixed(2)} MB at q${quality}`);
  }

  await context.close();
  return { id: variant.id, label: variant.label, theme: variant.theme, width: variant.width, height, state, files, problems };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await rm(options.outDir, { recursive: true, force: true });
  await mkdir(options.outDir, { recursive: true });

  const browser = await launch();
  const variants = [];
  try {
    for (const variant of VARIANTS) {
      variants.push(await captureVariant(browser, variant, options));
    }
  } finally {
    await browser.close();
  }

  const manifest = { url: options.url, capturedAt: new Date().toISOString(), variants };
  await writeFile(resolve(options.outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  // Surfaced as GitHub annotations on the run, not as a failure: a page that
  // broke is exactly when the screenshot is most worth posting.
  for (const v of variants) {
    if (v.state !== "ready") {
      console.log(`::warning title=Showcase not ready::${v.id} never signalled ready (${v.state}); the screenshot may be incomplete.`);
    }
    for (const problem of v.problems) console.log(`::warning title=Showcase console (${v.id})::${problem}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
