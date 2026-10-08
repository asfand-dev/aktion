#!/usr/bin/env node
/**
 * Fails when release-please would silently DROP a pull request from its release notes and version bump.
 *
 * When a PR is squash-merged, GitHub builds the commit message (title plus one "* subject" block per commit)
 * and release-please feeds it to @conventional-commits/parser. If the parser throws, release-please logs a
 * debug line and skips the whole squash commit: no error, no changelog entry, no version bump. The parser
 * throws on any body line whose first word is directly followed by "(" when the matching ")" does not come
 * before the next "(" or the end of the line, e.g. a line that starts with a code span such as `Foo("a", [Bar("b")])`.
 *
 * This script builds the squash message GitHub would create and runs it through release-please's own
 * parseConventionalCommits (version pinned in package.json, kept in step with the release-please-action
 * that release-please.yml uses), so the verdict is the real one, including the BEGIN_COMMIT_OVERRIDE block
 * of the PR body, which release-please reads instead of the commit message.
 *
 * Only the squash-merge path is modelled. A merge commit or a rebase merge lands each commit on its own, and
 * release-please then parses every commit message separately; this check does not cover those.
 *
 * Usage (live PR, needs GITHUB_REPOSITORY and PR_NUMBER, GITHUB_TOKEN optional for public repositories):
 *   node check-squash-message.mjs
 * Usage (offline): node check-squash-message.mjs --message-file msg.txt [--body-file pr-body.md]
 * Exit codes: 0 parses, 1 would be dropped, 2 could not run.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { parseConventionalCommits } = require("release-please/build/src/commit");
const { parser } = require("@conventional-commits/parser");

const OVERRIDE_BEGIN = "BEGIN_COMMIT_OVERRIDE";
const OVERRIDE_END = "END_COMMIT_OVERRIDE";

/**
 * Extracts the commit override block of a PR body the way release-please does.
 *
 * @param {string | null | undefined} body The PR description.
 * @returns {string} The trimmed text between the markers, or "" when there is none.
 */
export function extractOverride(body) {
  return ((body ?? "").split(OVERRIDE_BEGIN)[1] ?? "").split(OVERRIDE_END)[0].trim();
}

function splitMessage(message) {
  const [subject, ...rest] = message.trimEnd().split(/\r?\n/);
  return { subject, body: rest.join("\n").replace(/^\n+/, "") };
}

/**
 * Builds the message GitHub creates for a squash merge with the title setting COMMIT_OR_PR_TITLE and the
 * message setting COMMIT_MESSAGES. Merge commits are left out, as GitHub does. A single remaining commit
 * contributes its own subject and body; several contribute "* subject" plus body each, under the PR title.
 *
 * @param {{title: string, number: number, commits: {message: string, parents?: number}[]}} pr The PR.
 * @returns {string} The squash commit message.
 */
export function buildSquashMessage({ title, number, commits }) {
  const own = commits.filter((commit) => (commit.parents ?? 1) < 2);
  const header = (text) => `${text} (#${number})`;
  if (own.length === 1) {
    const { subject, body } = splitMessage(own[0].message);
    return body ? `${header(subject)}\n\n${body}` : header(subject);
  }
  const blocks = own.map((commit) => {
    const { subject, body } = splitMessage(commit.message);
    return body ? `* ${subject}\n\n${body}` : `* ${subject}`;
  });
  return blocks.length > 0 ? `${header(title)}\n\n${blocks.join("\n\n")}` : header(title);
}

function parses(text) {
  try {
    parser(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Finds the lines the parser rejects. Each body line is probed on its own after a stub summary and body
 * line (measured: the verdict is the same at the start of a paragraph, mid-paragraph and before trailers).
 *
 * @param {string} text The message release-please parses.
 * @param {string[]} errors The parser errors, used to add the reported position when no line probes bad.
 * @returns {{line: number, text: string}[]} One entry per rejected line, 1-based.
 */
export function findOffendingLines(text, errors = []) {
  const lines = text.split(/\r?\n/);
  const hits = [];
  lines.forEach((line, index) => {
    if (line.trim() === "") return;
    const ok = index === 0 ? parses(line) : parses(`fix: a\n\nx\n${line}`);
    if (!ok) hits.push({ line: index + 1, text: line });
  });
  if (hits.length === 0) {
    for (const error of errors) {
      const position = /at (\d+):\d+/.exec(error);
      if (position && lines[Number(position[1]) - 1] !== undefined) {
        hits.push({ line: Number(position[1]), text: lines[Number(position[1]) - 1] });
      }
    }
  }
  return hits;
}

/**
 * Runs the message through release-please's parser.
 *
 * @param {{message: string, prBody?: string | null}} input The squash message and the PR description.
 * @returns {{ok: boolean, source: "override" | "squash", text: string, parsed: number, errors: string[], offending: {line: number, text: string}[]}}
 */
export function checkSquashMessage({ message, prBody = "" }) {
  const override = extractOverride(prBody);
  const debug = [];
  const logger = { debug: (m) => debug.push(String(m)), info() {}, warn() {}, error() {}, trace() {} };
  const parsed = parseConventionalCommits(
    [{ sha: "squash", message, files: [], pullRequest: { body: prBody ?? "", number: 0, title: "", headBranchName: "", baseBranchName: "", labels: [], files: [] } }],
    logger,
  );
  const text = override || message;
  const errors = debug.filter((line) => line.startsWith("error message:")).map((line) => line.slice("error message:".length).trim().replace(/^Error: /, "").replaceAll("\n", "\\n"));
  const ok = debug.length === 0 && parsed.length > 0;
  return { ok, source: override ? "override" : "squash", text, parsed: parsed.length, errors, offending: ok ? [] : findOffendingLines(text, errors) };
}

/**
 * Renders the failure a developer sees.
 *
 * @param {ReturnType<typeof checkSquashMessage>} result A failed result.
 * @param {{commits?: {sha: string, message: string}[]}} [context] The PR commits, to name the commit a line came from.
 * @returns {string} The multi-line report.
 */
export function formatFailure(result, { commits = [] } = {}) {
  const origin = result.source === "override" ? "the BEGIN_COMMIT_OVERRIDE block of the PR description" : "the squash commit message GitHub will create";
  const lines = [
    `release-please cannot parse ${origin}, so it would DROP this PR from the release notes and the version bump (it only logs "commit could not be parsed" at debug level).`,
    "",
  ];
  if (result.offending.length > 0) {
    lines.push(`Offending line${result.offending.length > 1 ? "s" : ""} (line number within ${result.source === "override" ? "the override block" : "the squash message"}):`);
    for (const { line, text } of result.offending) {
      const commit = commits.find((c) => c.message.split(/\r?\n/).includes(text));
      const from = commit ? `   <- commit ${commit.sha.slice(0, 7)} "${commit.message.split(/\r?\n/)[0]}"` : "";
      lines.push(`  line ${line}: ${text}${from}`);
    }
  } else {
    lines.push("No single line could be blamed; the parser output below is all there is.");
  }
  if (result.errors.length > 0) lines.push("", `Parser error: ${result.errors.join(" | ")}`);
  if (result.source === "override") {
    lines.push("", `Hint: release-please treats everything after the first ${OVERRIDE_BEGIN} in the PR description as the commit message, even when the word only appears in prose or a code span. If you did not mean to write an override block, rephrase the mention (for example "commit override block") and the squash message is checked instead.`);
  }
  if (result.parsed === 0 && result.errors.length === 0) lines.push("", "The message parsed to zero conventional commits.");
  lines.push(
    "",
    'Why: the parser reads the first word of every body line as a possible footer token; a "(" directly after it opens a scope that must be closed by ")" before the next "(" or the end of the line. A line that starts with a code span like `Foo("a", [Bar("b")])` or `word(` trips it.',
    "",
    "Ways out, any one of them:",
    '  1. Reword the line in its commit (git rebase -i, reword) and push: indent it by a space, start it with "* " or "- ", or put a space before the "(".',
    `  2. Add an override block to the PR description; release-please reads it instead of the commit message, even after the merge:\n       ${OVERRIDE_BEGIN}\n       feat(scope): the one-line entry for the release notes\n       ${OVERRIDE_END}`,
    "  3. Squash the branch into one commit with a clean message before merging.",
  );
  return lines.join("\n");
}

/**
 * GETs a GitHub API path as JSON, retrying network errors, 429 and 5xx responses with exponential backoff
 * so a transient GitHub error does not turn the job red.
 *
 * @param {string} path The API path.
 * @param {{token?: string, base: string, attempts?: number, delayMs?: number}} options Token, API base URL and retry settings.
 * @returns {Promise<any>} The parsed response.
 */
export async function api(path, { token, base, attempts = 3, delayMs = 1000 }) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let retryable = true;
    try {
      const response = await fetch(`${base}${path}`, {
        headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      });
      if (response.ok) return await response.json();
      retryable = response.status >= 500 || response.status === 429;
      lastError = new Error(`GET ${path} failed: ${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    if (!retryable || attempt === attempts) break;
    await new Promise((resolve) => setTimeout(resolve, delayMs * 2 ** (attempt - 1)));
  }
  throw lastError;
}

export async function loadPullRequest({ repo, number, token, base }) {
  const pr = await api(`/repos/${repo}/pulls/${number}`, { token, base });
  const commits = [];
  for (let page = 1; page <= 3; page++) {
    const batch = await api(`/repos/${repo}/pulls/${number}/commits?per_page=100&page=${page}`, { token, base });
    commits.push(...batch.map((c) => ({ sha: c.sha, message: c.commit.message, parents: c.parents.length })));
    if (batch.length < 100) break;
  }
  return { title: pr.title, body: pr.body ?? "", number, commits };
}

function argValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

async function main(argv, env) {
  const messageFile = argValue(argv, "--message-file");
  let message;
  let prBody;
  let commits = [];
  if (messageFile) {
    message = readFileSync(messageFile, "utf8");
    const bodyFile = argValue(argv, "--body-file");
    prBody = bodyFile ? readFileSync(bodyFile, "utf8") : "";
  } else {
    const repo = argValue(argv, "--repo") ?? env.GITHUB_REPOSITORY;
    const number = Number(argValue(argv, "--pr") ?? env.PR_NUMBER);
    if (!repo || !Number.isInteger(number)) throw new Error("Set GITHUB_REPOSITORY and PR_NUMBER (or pass --repo owner/name --pr N, or --message-file).");
    const pr = await loadPullRequest({ repo, number, token: env.GITHUB_TOKEN, base: env.GITHUB_API_URL ?? "https://api.github.com" });
    commits = pr.commits;
    prBody = pr.body;
    message = buildSquashMessage(pr);
    if (pr.commits.length >= 250) console.warn("::warning::The PR has 250 or more commits; GitHub lists no more, so the check may be incomplete.");
  }
  if (hasEmptyOverride(prBody)) console.warn(`::warning::The PR description mentions ${OVERRIDE_BEGIN} but release-please finds no text in the block (missing ${OVERRIDE_END} or empty), so it ignores it.`);
  const result = checkSquashMessage({ message, prBody });
  if (result.ok) {
    console.log(`release-please parses the ${result.source === "override" ? "override block" : "squash message"} (${result.parsed} conventional commit${result.parsed === 1 ? "" : "s"}).`);
    return 0;
  }
  const report = formatFailure(result, { commits });
  console.error(report);
  const first = result.offending[0];
  console.log(`::error title=release-please cannot parse the squash commit message::${first ? `line ${first.line}: ${first.text}` : "see the job log"} (see the job log for the three ways out)`.replace(/\r?\n/g, " "));
  return 1;
}

function hasEmptyOverride(body) {
  return (body ?? "").includes(OVERRIDE_BEGIN) && extractOverride(body) === "";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2), process.env).then(
    (code) => process.exit(code),
    (error) => {
      console.error(`check-squash-message could not run: ${error.message}`);
      process.exit(2);
    },
  );
}
